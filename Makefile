run:
	docker compose down --remove-orphans && docker compose up --build

test:
	curl -X GET "http://localhost:3000/api/v1/places?lat=48.8584&lon=2.2945&radius=500&page=1&limit=10&cache=false" -H "accept: application/json"