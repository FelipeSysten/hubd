/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@higgsfield/client", "postgres"],
  // No Windows local o Next abre um worker por núcleo e falha ("spawn UNKNOWN") ou fica sem memória.
  // No Vercel (Linux) vale o padrão do Next.
  ...(process.platform === "win32" && {
    experimental: { cpus: Number(process.env.NEXT_BUILD_CPUS) || 2 },
  }),
};

export default nextConfig;
