const domain = process.env.NEXT_PUBLIC_CLERK_FRONTEND_API_URL;

if (!domain) {
  throw new Error("NEXT_PUBLIC_CLERK_FRONTEND_API_URL is not defined");
}

const config = {
  providers: [
    {
      applicationID: "convex",
      domain,
    },
  ],
};

export default config;
