# Compose Ports (Standardized)

This table reflects the updated port mappings in `docker-compose.kafka.yml`.

Service | Host Port | Container Port | Default Port | Notes
---|---|---|---|---
kafka | 9092 | 9092 | 9092 | Default Kafka broker port
kafka-ui | 8080 | 8080 | 8080 | Default Kafka UI port
schema-registry | 8081 | 8081 | 8081 | Default Schema Registry port
postgres | 5432 | 5432 | 5432 | Default Postgres port
pgadmin | 5050 | 80 | 80 | Host port adjusted to avoid conflicts
mongo | 27017 | 27017 | 27017 | Default MongoDB port
mongo-express | 8082 | 8081 | 8081 | Host port adjusted (schema-registry uses 8081)
ingest-api | 8088 | 8088 | n/a | Custom service on fixed port
detector | 4001 | 4001 | n/a | Custom microservice (4000 series)
indexer | 4002 | 4002 | n/a | Custom microservice (4000 series)
notification | 4003 | 4003 | n/a | Custom microservice (4000 series)
genai | 4100 | 4100 | n/a | Custom microservice (4000 series)
dashboard-api | 4200 | 4200 | n/a | Custom microservice (4000 series)
dashboard-ui | 4300 | 4300 | n/a | Custom UI (4000 series)
elasticsearch | 9200 | 9200 | 9200 | Default Elasticsearch HTTP port
kibana | 5601 | 5601 | 5601 | Default Kibana port
prometheus | 9090 | 9090 | 9090 | Default Prometheus port
loki | 3100 | 3100 | 3100 | Default Loki port
promtail | 9080 | 9080 | 9080 | Default Promtail port
grafana | 3000 | 3000 | 3000 | Default Grafana port
