import { ulid } from 'ulid';
import { createDatabase, users, agents } from './index.js';

/**
 * Seed the database with test data
 */
async function seed() {
  const db = createDatabase({
    connectionString: process.env.DATABASE_URL || 'postgresql://macp:macp@localhost:5432/macp',
  });

  console.log('Seeding database...');

  // Create test users
  const testUsers = [
    {
      id: ulid(),
      email: 'alice@example.com',
      displayName: 'Alice',
      preferences: { notificationsEnabled: true },
    },
    {
      id: ulid(),
      email: 'bob@example.com',
      displayName: 'Bob',
      preferences: { notificationsEnabled: true },
    },
  ];

  console.log('Creating test users...');
  for (const user of testUsers) {
    await db.insert(users).values(user).onConflictDoNothing();
    console.log(`  Created user: ${user.displayName} (${user.email})`);
  }

  // Create default agents for each user
  const testAgents = [
    {
      id: ulid(),
      ownerId: testUsers[0].id,
      displayName: "Alice's Claude",
      personality: 'Thoughtful, analytical, and curious. Enjoys exploring multiple perspectives.',
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-20250514',
      temperature: 70,
      maxTokens: 1000,
      isDefault: true,
      isActive: true,
    },
    {
      id: ulid(),
      ownerId: testUsers[1].id,
      displayName: "Bob's GPT",
      personality: 'Practical, creative, and solution-oriented. Focuses on actionable insights.',
      provider: 'openai',
      modelId: 'gpt-4o',
      temperature: 70,
      maxTokens: 1000,
      isDefault: true,
      isActive: true,
    },
  ];

  console.log('Creating test agents...');
  for (const agent of testAgents) {
    await db.insert(agents).values(agent).onConflictDoNothing();
    console.log(`  Created agent: ${agent.displayName}`);
  }

  console.log('\nSeed complete!');
  console.log(`\nTest credentials:`);
  console.log(`  Alice: alice@example.com (ID: ${testUsers[0].id})`);
  console.log(`  Bob: bob@example.com (ID: ${testUsers[1].id})`);

  process.exit(0);
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
