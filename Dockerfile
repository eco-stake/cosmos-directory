FROM node:alpine

RUN apk update && apk add git

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . ./

ARG REGISTRY_URL=https://github.com/cosmos/chain-registry

RUN git clone ${REGISTRY_URL} /usr/src/chain-registry

EXPOSE 3000
CMD node proxy.js
