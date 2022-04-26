FROM node:17-alpine

RUN apk update && apk add git

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
RUN npm install pm2 -g
COPY . ./

EXPOSE 3000

ENV NODE_ENV=production
ENV APP_NAME=app

CMD pm2-runtime ecosystem.${NODE_ENV}.json --only ${APP_NAME}