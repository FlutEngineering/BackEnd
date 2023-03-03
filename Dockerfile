FROM node:19-alpine
WORKDIR /app

COPY package.json ./
COPY yarn.lock ./
RUN yarn install

COPY . .
RUN yarn prisma:generate
RUN yarn prisma:migrate

USER node
