# 1. Start from an official pre-made blueprint that has Node.js installed
FROM node:20-alpine

# 2. Create a folder inside the virtual container to hold your app
WORKDIR /usr/src/app

# 3. Copy your package files first (helps with speed optimization)
COPY package*.json ./

# 4. Install your project's dependencies inside the container
RUN npm install

# 5. Copy the rest of your app's source code into the container
COPY . .

# Build the TypeScript project
RUN npm run build

# 6. Expose the port your Express app listens on (e.g., 3000)
EXPOSE 3000

# 7. The command that actually starts your app when the container boots up
CMD ["npm", "start"]