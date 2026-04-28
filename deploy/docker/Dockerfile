# Custom Frappe image with farm_manager pre-installed.
# Used when deploying via container registries that build a single image.
FROM frappe/erpnext:v15

USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq-dev gcc python3-dev \
    && rm -rf /var/lib/apt/lists/*

USER frappe
WORKDIR /home/frappe/frappe-bench

ARG FARM_MANAGER_REPO=https://github.com/<your-org>/farm_manager.git
ARG FARM_MANAGER_BRANCH=main

RUN bench get-app --branch ${FARM_MANAGER_BRANCH} ${FARM_MANAGER_REPO} || true

ENTRYPOINT ["bash", "-lc"]
CMD ["bench start"]
