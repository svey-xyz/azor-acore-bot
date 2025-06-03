FROM node:alpine as ts-compiler
WORKDIR /usr/app
COPY package.json ./
COPY tsconfig.json ./
RUN npm install
COPY . ./
RUN npm run build

FROM node:alpine as ts-remover
WORKDIR /usr/app
COPY --from=ts-compiler /usr/app/package.json ./
COPY --from=ts-compiler /usr/app/dist ./
RUN npm install --only=production

FROM gcr.io/distroless/nodejs:latest
WORKDIR /usr/app
COPY --from=ts-remover /usr/app ./
USER 1000

CMD [ "bot.js" ]