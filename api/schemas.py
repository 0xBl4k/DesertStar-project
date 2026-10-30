from datetime import datetime, timedelta
from pydantic import BaseModel, Field, model_validator

# more samples more detailed movement and visibility data slower calculation, and the opposite is correct
MAX_DURATION_DAYS = 90
MAX_SAMPLES = 5000 # safeguard 
class VisibilityRequest(BaseModel):
    lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    lon: float = Field(ge=-180, le=360, allow_inf_nan=False)

    start_utc: datetime
    end_utc: datetime

    step_minutes: int = Field(ge=5, le=360)

    @model_validator(mode="after")
    def validate_request(self):
        
        if (self.start_utc.utcoffset() is None or self.end_utc.utcoffset is None): #checks for timezone infromation
            raise ValueError("Both timestamps must include timezone information")
        
        if self.start_utc.utcoffset() != timedelta(0) or self.end_utc.utcoffset() != timedelta(0): # checks if timestamp uses UTC
            raise ValueError("Both timestamps must use UTC")
        
        if self.end_utc <= self.start_utc: # checks if end date is not before start date
            raise ValueError("end time must be after start time")
        
        duration = self.end_utc - self.start_utc
        if duration > timedelta(days=MAX_DURATION_DAYS):
            raise ValueError("Maximum duration is 90 days") # checks for a duration between two dates
        
        samples = (duration.total_seconds() // (self.step_minutes * 60)) + 1
        
        if samples > MAX_SAMPLES: # checks for samples
            raise ValueError("Maximum 5000 samples per request")
        
        return self
