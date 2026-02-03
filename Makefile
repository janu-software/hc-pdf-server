upgrade:
	git pull
	docker build -t hc-pdf-server:latest .
	docker service scale pdf-stack_worker=0
	docker stack deploy --detach=false -c docker-compose.yml pdf-stack

upgrade-no-cache:
	git pull
	docker build --no-cache -t hc-pdf-server:latest .
	docker service scale pdf-stack_worker=0
	docker stack deploy --detach=false -c docker-compose.yml pdf-stack
