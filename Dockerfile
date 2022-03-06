FROM node:alpine

RUN apk update && apk add git

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . ./

RUN git clone https://github.com/cosmos/chain-registry /usr/src/chain-registry

EXPOSE 3000
CMD node proxy.js
