from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "RechnungTracker Parser"
    app_version: str = "0.1.0"
    upload_dir: str = "/app/storage/uploads"
    max_file_size_mb: int = 20
    parser_timeout_seconds: int = 60
    tesseract_cmd: str = "tesseract"
    tesseract_lang: str = "deu+eng"

    model_config = {"env_prefix": "PARSER_"}


settings = Settings()
