from api.schemas import VisibilityRequest

def calculate_visibility(request: VisibilityRequest) -> dict:
    return {
        "status":"science_not_connected",
        "coordinates":{
            "lat":request.lat,
            "lon":request.lon
        }
    }