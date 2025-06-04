FROM node:16-alpine

WORKDIR /app

# 复制package.json和package-lock.json（如果存在）
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制源代码
COPY . .

EXPOSE 3000

CMD ["npm", "start"] 