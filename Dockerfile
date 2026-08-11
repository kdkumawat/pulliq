# Pulliq - Next.js app with yt-dlp + ffmpeg for media processing
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Pass GA (and other NEXT_PUBLIC) into the build when Render provides them
ARG NEXT_PUBLIC_GA_MEASUREMENT_ID
ARG GA_MEASUREMENT_ID
ENV NEXT_PUBLIC_GA_MEASUREMENT_ID=${NEXT_PUBLIC_GA_MEASUREMENT_ID}
ENV GA_MEASUREMENT_ID=${GA_MEASUREMENT_ID}
RUN bun run build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Install ffmpeg + yt-dlp WITH the [default] extras (EJS JS runtime) which
# YouTube extraction requires since 2026. The entrypoint re-updates yt-dlp on
# every container start so player changes don't require an app redeploy.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip ca-certificates \
  && pip3 install --break-system-packages --no-cache-dir -U "yt-dlp[default]" \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules/exiftool-vendored.pl ./node_modules/exiftool-vendored.pl
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Cap the Node heap so a runaway request can't OOM the whole container.
ENV NODE_OPTIONS=--max-old-space-size=768

EXPOSE 3000
CMD ["/app/entrypoint.sh"]
