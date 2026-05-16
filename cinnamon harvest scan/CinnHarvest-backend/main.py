import os
from pymongo import MongoClient
from app import create_app


app = create_app()


if __name__ == "__main__":

    try:
        client = MongoClient(os.getenv("MONGODB_URI"))
        client.admin.command("ping")
        print(" MongoDB Connected Successfully")
    except Exception as e:
        print(" MongoDB Connection Failed:", e)

    app.run(
        host=app.config["HOST"],
        port=app.config["PORT"],
        debug=app.config["DEBUG"],
    )
