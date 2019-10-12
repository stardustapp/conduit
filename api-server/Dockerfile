FROM mhart/alpine-node:12

# Add node deps
ADD package*.json .
RUN npm ci

# Add source files
ADD src src
CMD ["node", "src"]
