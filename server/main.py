from fastapi import FastAPI

app = FastAPI(title="carrot server API")

@app.get("/")
def read_root():
    return {"status": "carrot server running", "version": "1.0.0"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
