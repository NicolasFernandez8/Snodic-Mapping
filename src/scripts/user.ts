/**
 * Administración de usuarios desde la terminal (la contraseña nunca va como argumento).
 *
 *   npm run user -- create <usuario> admin|member   → pide la contraseña dos veces (oculta)
 *   npm run user -- passwd <usuario>
 *   npm run user -- role <usuario> admin|member
 *   npm run user -- delete <usuario>
 *   npm run user -- list
 *
 * Para scripts: SNODIC_PASSWORD_STDIN=1 lee la contraseña de la entrada estándar.
 */
import { createInterface } from "node:readline";
import { createUser, deleteUser, listUsers, setPassword, setRole, type Role } from "../lib/auth/users";
import { pool } from "../lib/db";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    out._writeToOutput = (s: string) => {
      if (s.includes(prompt)) out.output.write(prompt);
    };
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function password(): Promise<string> {
  if (process.env.SNODIC_PASSWORD_STDIN === "1") return readStdin();
  const a = await askHidden("Contraseña: ");
  const b = await askHidden("Repetir contraseña: ");
  if (a !== b) throw new Error("Las contraseñas no coinciden");
  return a;
}

const asRole = (r: string | undefined): Role => {
  if (r !== "admin" && r !== "member") throw new Error('Rol inválido: usar "admin" o "member"');
  return r;
};

async function main() {
  const [cmd, user, arg] = process.argv.slice(2);
  switch (cmd) {
    case "create": {
      if (!user) throw new Error("Falta el usuario");
      const u = await createUser(user, await password(), asRole(arg ?? "member"));
      console.log(`✔ Usuario ${u.username} creado (${u.role})`);
      break;
    }
    case "passwd":
      if (!user) throw new Error("Falta el usuario");
      await setPassword(user, await password());
      console.log(`✔ Contraseña de ${user} actualizada (sesiones cerradas)`);
      break;
    case "role":
      if (!user) throw new Error("Falta el usuario");
      await setRole(user, asRole(arg));
      console.log(`✔ ${user} ahora es ${arg}`);
      break;
    case "delete":
      if (!user) throw new Error("Falta el usuario");
      await deleteUser(user);
      console.log(`✔ Usuario ${user} borrado`);
      break;
    case "list":
      for (const u of await listUsers()) console.log(`${u.username.padEnd(20)} ${u.role.padEnd(8)} último ingreso: ${u.last_login_at ?? "-"}`);
      break;
    default:
      console.log("Uso: npm run user -- create|passwd|role|delete|list <usuario> [admin|member]");
  }
}

main()
  .catch((e) => {
    console.error(`✖ ${(e as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => pool().end());
