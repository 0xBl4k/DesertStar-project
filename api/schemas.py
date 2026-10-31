from datetime import datetime, timedelta
from pydantic import BaseModel, Field, model_validator
from typing import Literal

# more samples more detailed movement and visibility data slower calculation, and the opposite is correct
MAX_DURATION_DAYS = 365
MAX_SAMPLES = 10_000 # safeguard 
class VisibilityRequest(BaseModel):
    mode: Literal["preset", "custom"]
    site_id: str | None = None
    lat: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    lon: float | None = Field(default=None, ge=-180, le=360, allow_inf_nan=False)

    start_utc: datetime
    end_utc: datetime

    step_minutes: int = Field(ge=5, le=360)

    @model_validator(mode="after")
    def validate_request(self):
        if self.mode == "preset":
            if not self.site_id or self.lat is not None or self.lon is not None:
                raise ValueError("Preset requires site_id only")
        elif self.mode == "custom":
            if self.site_id is not None or self.lat is None or self.lon is None:
                raise ValueError("Custom requires lat and lon only")
            
        if (self.start_utc.utcoffset() is None or self.end_utc.utcoffset() is None): #checks for timezone infromation
            raise ValueError("Both timestamps must include timezone information")
        
        if self.start_utc.utcoffset() != timedelta(0) or self.end_utc.utcoffset() != timedelta(0): # checks if timestamp uses UTC
            raise ValueError("Both timestamps must use UTC")
        
        if self.end_utc <= self.start_utc: # checks if end date is not before start date
            raise ValueError("end time must be after start time")
        
        duration = self.end_utc - self.start_utc
        if duration > timedelta(days=MAX_DURATION_DAYS):
            raise ValueError("Maximum duration is 365 days") # checks for a duration between two dates
        
        samples = (duration.total_seconds() // (self.step_minutes * 60)) + 1
        
        if samples > MAX_SAMPLES: # checks for samples
            raise ValueError("Maximum 5000 samples per request")
        
        return self
