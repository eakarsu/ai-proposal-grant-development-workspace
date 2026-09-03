import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { appConfig } from "@/config/app";
import prisma from "./prisma";

const secureCookies =
  process.env.AUTH_COOKIE_SECURE === "true" ||
  process.env.NEXTAUTH_URL?.startsWith("https://") === true;
const cookiePrefix = `${secureCookies ? "__Secure-" : ""}${appConfig.slug}`;

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  pages: { signIn: "/login" },
  cookies: {
    sessionToken: {
      name: `${cookiePrefix}.session-token`,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: secureCookies },
    },
    callbackUrl: {
      name: `${cookiePrefix}.callback-url`,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: secureCookies },
    },
    csrfToken: {
      name: `${secureCookies ? "__Host-" : ""}${appConfig.slug}.csrf-token`,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: secureCookies },
    },
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) {
          return null;
        }
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });
        if (!user) return null;
        const ok = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );
        if (!ok) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id ?? "");
        session.user.role = String(token.role ?? "ANALYST");
      }
      return session;
    },
  },
};
