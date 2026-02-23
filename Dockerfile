FROM node:20-bullseye

# Install build tools for compiling C++
RUN apt-get update && apt-get install -y build-essential ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first for better caching
COPY package*.json ./
RUN npm ci --only=production || npm ci

# Copy app source
COPY . .

# Try to compile the C++ binary during image build
RUN bash compile.sh || true

EXPOSE 8080

CMD ["npm", "start"]
