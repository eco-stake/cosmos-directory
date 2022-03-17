FROM node:alpine

RUN apk update && apk add git

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
RUN npm install pm2 -g
COPY . ./

ARG REGISTRY_URL=https://github.com/cosmos/chain-registry
ENV REGISTRY_URL=${REGISTRY_URL}
RUN git clone ${REGISTRY_URL} /usr/src/chain-registry

ARG REGISTRY_BRANCH=master
ENV REGISTRY_BRANCH=${REGISTRY_BRANCH}
RUN cd /usr/src/chain-registry && git checkout ${REGISTRY_BRANCH}

ARG REGISTRY_REFRESH=1800
ENV REGISTRY_REFRESH=${REGISTRY_REFRESH}

EXPOSE 3000

CMD ["pm2-runtime", "proxy.js"]