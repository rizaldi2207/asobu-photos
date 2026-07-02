FROM node:20-alpine

# libc6-compat helps sharp's prebuilt binaries run on Alpine.
# ffmpeg is used to extract poster frames from uploaded videos.
RUN apk add --no-cache libc6-compat ffmpeg

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

EXPOSE 3000
CMD ["node", "src/index.js"]
