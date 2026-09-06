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
        if (process.env.NODE_ENV === "production" && credentials?.password === "Demo!23456") return null;
        if (!credentials?.email || !credentials.password) {
          return null;
        }
        const bucket = `login:${credentials.email.trim().toLowerCase()}:${new Date().toISOString().slice(0, 13)}`;
        const attempts = await prisma.usageBucket.upsert({where:{id:bucket},create:{id:bucket,calls:1},update:{calls:{increment:1}}});
        if (attempts.calls > 20) return null;
        const user = await prisma.user.findUnique({
          where: { email: credentials.email.trim().toLowerCase() },
        });
        if (!user?.active) return null;
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
        const current=await prisma.user.findUnique({where:{id:user.id},select:{authVersion:true}});token.authVersion=current?.authVersion;
      }
      const current=token.id?await prisma.user.findUnique({where:{id:token.id},select:{role:true,active:true,authVersion:true}}):null;
      token.invalid=!current?.active || current.authVersion!==token.authVersion;
      if(current)token.role=current.role;
      return token;
    },
    async session({ session, token }) {
      session.invalid=token.invalid;
      if (session.user) {
        session.user.authVersion=token.authVersion;
        session.user.id = String(token.id ?? "");
        session.user.role = String(token.role ?? "ANALYST");
      }
      return session;
    },
  },
};
