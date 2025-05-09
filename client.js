const net = require("net");
const fs = require("fs");
const path = require("path");

// --- Configuration ---
const SERVER_HOST = "localhost";
const SERVER_PORT = 3000;
const PACKET_SIZE = 17;
const CALL_TYPE_STREAM = 1;
const CALL_TYPE_RESEND = 2;
const OUTPUT_FILENAME = "stock_data.json";

// --- Data Storage ---
const receivedPackets = new Map();
let highestSequenceReceived = 0;

// --- Helper Function to Parse a Single Packet ---
function parsePacket(buffer) {
  // Ensure the buffer is exactly PACKET_SIZE
  if (buffer.length !== PACKET_SIZE) {
    console.error(
      `Error: Invalid buffer size for packet parsing. Expected ${PACKET_SIZE}, got ${buffer.length}`
    );
    return null; // Or throw an error
  }

  // Parse fields (all Big Endian as per spec)
  const symbol = buffer.toString("ascii", 0, 4).trim();
  const indicator = buffer.toString("ascii", 4, 5);
  const quantity = buffer.readInt32BE(5);
  const price = buffer.readInt32BE(9);
  const sequence = buffer.readInt32BE(13);

  return {
    symbol: symbol,
    indicator: indicator,
    quantity: quantity,
    price: price,
    sequence: sequence,
  };
}

// --- Helper Function to Create Request Buffer ---
function createRequestBuffer(callType, resendSeq = 0) {
  // Server expects a 2-byte payload.
  const buffer = Buffer.alloc(2);
  buffer.writeUInt8(callType, 0);
  buffer.writeUInt8(resendSeq, 1);
  return buffer;
}

// --- Function to handle the initial Stream All Packets request ---
async function requestStream() {
  return new Promise((resolve, reject) => {
    console.log(
      `Connecting to ${SERVER_HOST}:${SERVER_PORT} for initial stream...`
    );
    const client = net.createConnection(
      { host: SERVER_HOST, port: SERVER_PORT },
      () => {
        console.log("Connected for initial stream.");
        // Send the "Stream All Packets" request (Call Type 1)
        const request = createRequestBuffer(CALL_TYPE_STREAM);
        client.write(request);
      }
    );

    let dataBuffer = Buffer.alloc(0);

    client.on("data", (data) => {
      // Append new data to the buffer
      dataBuffer = Buffer.concat([dataBuffer, data]);

      // Process the buffer, extracting full packets
      while (dataBuffer.length >= PACKET_SIZE) {
        const packetBuffer = dataBuffer.subarray(0, PACKET_SIZE);
        const packet = parsePacket(packetBuffer);

        if (packet) {
          // Store the packet, overwriting if a duplicate sequence is somehow received
          receivedPackets.set(packet.sequence, packet);
          // Update the highest sequence seen so far
          if (packet.sequence > highestSequenceReceived) {
            highestSequenceReceived = packet.sequence;
          }
        } else {
          console.error("Skipping malformed packet.");
        }

        // Remove the processed packet from the buffer
        dataBuffer = dataBuffer.subarray(PACKET_SIZE);
      }
    });

    client.on("end", () => {
      console.log("Server disconnected (initial stream ended).");

      resolve();
    });

    client.on("error", (err) => {
      console.error("Connection error during initial stream:", err.message);

      reject(err);
    });

    client.on("close", () => {
      console.log("Connection closed for initial stream.");
    });
  });
}

// --- Function to request a single missing packet (Call Type 2) ---
async function requestMissingPacket(sequence) {
  return new Promise((resolve, reject) => {
    console.log(`Requesting missing packet sequence: ${sequence}`);
    const client = net.createConnection(
      { host: SERVER_HOST, port: SERVER_PORT },
      () => {
        console.log(`Connected for resend seq ${sequence}.`);

        const request = createRequestBuffer(CALL_TYPE_RESEND, sequence);
        client.write(request);
      }
    );

    let dataBuffer = Buffer.alloc(0);

    client.on("data", (data) => {
      dataBuffer = Buffer.concat([dataBuffer, data]);

      if (dataBuffer.length >= PACKET_SIZE) {
        const packetBuffer = dataBuffer.subarray(0, PACKET_SIZE);
        const packet = parsePacket(packetBuffer);

        if (packet) {
          receivedPackets.set(packet.sequence, packet);
          console.log(`Received resent packet sequence: ${packet.sequence}`);

          client.end();
          resolve();
        } else {
          console.error(
            `Error parsing resent packet sequence ${sequence}. Skipping.`
          );

          client.end();
          reject(new Error(`Malformed resent packet for sequence ${sequence}`));
        }
      }
    });

    client.on("end", () => {
      console.log(`Connection ended for resend seq ${sequence}.`);

      if (dataBuffer.length < PACKET_SIZE && !receivedPackets.has(sequence)) {
        console.error(
          `Connection ended before receiving full packet for seq ${sequence}.`
        );
        reject(
          new Error(
            `Connection ended before receiving full packet for seq ${sequence}`
          )
        );
      }
    });

    client.on("error", (err) => {
      console.error(
        `Connection error during resend seq ${sequence}:`,
        err.message
      );
      reject(err);
    });

    client.on("close", (hadError) => {
      console.log(
        `Connection closed for resend seq ${sequence}${
          hadError ? " with error" : ""
        }.`
      );
    });
  });
}

// --- Main Execution Flow ---
async function runClient() {
  try {
    // 1. Request the initial stream of packets
    await requestStream();
    console.log(
      `Initial stream finished. Highest sequence received: ${highestSequenceReceived}`
    );
    console.log(
      `Total unique packets received so far: ${receivedPackets.size}`
    );

    const missingSequences = [];

    for (let i = 1; i <= highestSequenceReceived; i++) {
      if (!receivedPackets.has(i)) {
        missingSequences.push(i);
      }
    }

    console.log(`Identified ${missingSequences.length} missing sequences.`);
    if (missingSequences.length > 0) {
      console.log("Missing sequences:", missingSequences);

      for (const seq of missingSequences) {
        try {
          await requestMissingPacket(seq);
        } catch (resendErr) {
          console.error(
            `Failed to resend sequence ${seq}: ${resendErr.message}`
          );
        }
      }
      console.log("Finished requesting missing packets.");
      console.log(`Total unique packets after resend: ${receivedPackets.size}`);
    }

    const allPacketsArray = Array.from(receivedPackets.values());

    allPacketsArray.sort((a, b) => a.sequence - b.sequence);

    if (allPacketsArray.length !== highestSequenceReceived) {
      console.warn(
        `Warning: Output array size (${allPacketsArray.length}) does not match highest sequence received (${highestSequenceReceived}). Some sequences might be genuinely missing or failed to resend.`
      );
    }

    const outputPath = path.join(__dirname, OUTPUT_FILENAME);
    fs.writeFileSync(outputPath, JSON.stringify(allPacketsArray, null, 2));
    console.log(`Successfully wrote all packets to ${outputPath}`);
  } catch (mainError) {
    console.error("An error occurred during the client process:", mainError);
  }
}

runClient();
