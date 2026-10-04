const fs = require("fs");

const file = "./server.js";
let content = fs.readFileSync(file, "utf8");

if (!content.includes('const migrationRoutes = require("./routes/migration");')) {
  const marker = 'const kycRoutes = require("./routes/kyc");';

  if (!content.includes(marker)) {
    throw new Error("KYC route import marker not found.");
  }

  content = content.replace(
    marker,
    marker + '\nconst migrationRoutes = require("./routes/migration");'
  );
}

if (!content.includes('app.use("/api/migration", migrationRoutes);')) {
  const marker = 'app.use("/api/kyc", kycRoutes);';

  if (!content.includes(marker)) {
    throw new Error("KYC route mount marker not found.");
  }

  content = content.replace(
    marker,
    marker + '\napp.use("/api/migration", migrationRoutes);'
  );
}

fs.writeFileSync(file, content);

console.log("MIGRATION ROUTE MOUNTED");
