# BetaCrew Exchange Client

This project implements a Node.js client application designed to interact with the BetaCrew mock exchange server as part of a take-home technical assessment.

The client connects to the server via TCP, requests a stream of stock ticker packet data, identifies any missing packets based on sequence numbers, requests those missing packets individually, and finally compiles all received packets into a single JSON array, sorted by sequence number, ensuring no sequences are missing up to the highest sequence received.

## Features

- Connects to the BetaCrew mock exchange server via TCP.
- Sends requests for the full packet stream (Call Type 1).
- Handles binary data reception and parsing (Big Endian).
- Identifies missing packet sequences after the initial stream.
- Requests specific missing packets (Call Type 2).
- Combines and sorts all received packets by sequence number.
- Outputs the complete, ordered packet data to a JSON file (`stock_data.json`).


## How to Run

1.  **Start the Server:**

    - Open your first terminal window.
    - Navigate to the directory where you placed the server (`main.js`) and client (`client.js`) files.
    - Run the server using the command:
    - ```bash
      cd betacrew_exchange_server
      ```
      ```bash
      node main.js
      ```
    - Leave this terminal window open and running. You should see output indicating the server has started on port 3000.

2.  **Run the Client:**
    - Open your second terminal window.
    - Navigate to the **same directory** as the server files.
    - Run the client using the command:
      ```bash
      node client.js
      ```
    - Observe the output in this terminal. The client will log its connection attempts, data reception, missing sequence identification, and resend requests.

## Output

Upon successful execution, the client will create a file named `stock_data.json` in the same directory.

This JSON file will contain a single array of objects. Each object represents a parsed packet and will have the following structure:

```json
{
  "symbol": "ABCD",
  "indicator": "B",
  "quantity": 100,
  "price": 12345,
  "sequence": 1
}
```
