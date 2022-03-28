FROM node:alpine

RUN apk update && apk add git

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
RUN npm install pm2 -g
COPY . ./

EXPOSE 3000

ENV APP_NAME=app
ENV APP_COUNT=1

CMD pm2-runtime ${APP_NAME}.js --instances $APP_COUNT