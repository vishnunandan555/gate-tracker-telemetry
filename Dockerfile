FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install

COPY . ./

RUN npm run build

EXPOSE 3000

ENV NODE_ENV=production

CMD ["npm", "start"]