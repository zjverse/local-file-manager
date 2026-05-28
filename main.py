#!/usr/bin/env python3
import uvicorn
from server import app

if __name__ == "__main__":
    print("Local File Manager started at http://127.0.0.1:4060")
    uvicorn.run(app, host="127.0.0.1", port=4060)
