FROM node:20-slim
WORKDIR /app
COPY backend/recruitment-mvp ./backend/recruitment-mvp
COPY ux-ui/recruitment-mvp ./ux-ui/recruitment-mvp
WORKDIR /app/backend/recruitment-mvp
RUN npm install --omit=dev
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
