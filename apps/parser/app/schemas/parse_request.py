from pydantic import BaseModel


class ParseRequest(BaseModel):
    file_path: str
