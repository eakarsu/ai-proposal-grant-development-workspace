import fs from 'node:fs';
import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
if (fs.existsSync('.env')) process.loadEnvFile('.env');
const email = process.argv[2]?.trim().toLowerCase();
const password = process.env.NEW_ACCOUNT_PASSWORD;
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length < 16 || Buffer.byteLength(password) > 72) throw new Error('Supply an account email and NEW_ACCOUNT_PASSWORD (16+ characters, at most 72 bytes). Passwords must not be passed on the command line.');
const prisma = new PrismaClient();
try {
  const passwordHash = await bcrypt.hash(password,12);
  await prisma.$transaction(async tx => {
    const existing = await tx.user.findUnique({where:{email}});
    let user;
    if (existing) user = await tx.user.update({where:{id:existing.id},data:{passwordHash}});
    else {
      if (await tx.user.count()) throw new Error('Account not found. Use the administrator account page to add users.');
      user = await tx.user.create({data:{email,name:'Workspace administrator',passwordHash,role:'ADMIN'}});
    }
    await tx.auditLog.create({data:{actorName:'Local account maintenance',action:existing?'PASSWORD_RESET':'ADMIN_BOOTSTRAP',entity:'User',entityId:user.id,detail:JSON.stringify({email,source:'Local operator with database access'})}});
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  console.log(`Account password configured for ${email}`);
} finally { await prisma.$disconnect(); }
