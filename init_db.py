
from database import get_connection


def initialize_database():
    with open("schema.sql", "r", encoding="utf-8") as file:
        schema = file.read()

    with get_connection() as conn:
        conn.execute(schema)

    print("StudyBloom database initialized successfully!")


if __name__ == "__main__":
    initialize_database()
