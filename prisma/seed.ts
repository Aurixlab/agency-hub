import { PrismaClient, Role, Priority } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// ============================================
// TEAM MEMBERS & INITIAL PASSWORDS
// ============================================
// Everyone must change their password on first login.
//
// Username       | Initial Password
// ─────────────────────────────────────
// admin          | Admin@Hub2024
// aaryan         | Aaryan@Hub2024
// ahnaf          | Ahnaf@Hub2024
// mimo           | Mimo@Hub2024
// fahim          | Fahim@Hub2024
// ridwan         | Ridwan@Hub2024
// abir           | Abir@Hub2024
// quraishi       | Quraishi@Hub2024
// furqan         | Furqan@Hub2024
// guest          | Guest@Hub2024
// ============================================

const users = [
  { username: 'admin', name: 'Admin', role: Role.ADMIN, password: 'Admin@Hub2024' },
  { username: 'aaryan', name: 'Aaryan', role: Role.MEMBER, password: 'Aaryan@Hub2024' },
  { username: 'ahnaf', name: 'Ahnaf', role: Role.MEMBER, password: 'Ahnaf@Hub2024' },
  { username: 'mimo', name: 'Mimo', role: Role.MEMBER, password: 'Mimo@Hub2024' },
  { username: 'fahim', name: 'Fahim', role: Role.MEMBER, password: 'Fahim@Hub2024' },
  { username: 'ridwan', name: 'Ridwan', role: Role.MEMBER, password: 'Ridwan@Hub2024' },
  { username: 'abir', name: 'Abir', role: Role.MEMBER, password: 'Abir@Hub2024' },
  { username: 'quraishi', name: 'Quraishi', role: Role.MEMBER, password: 'Quraishi@Hub2024' },
  { username: 'furqan', name: 'Furqan', role: Role.MEMBER, password: 'Furqan@Hub2024' },
  { username: 'guest', name: 'Guest', role: Role.GUEST, password: 'Guest@Hub2024' },
];

const templates = [
  {
    name: 'Web Development Team',
    description: 'Full-stack web development workflow with design, development, QA, and deployment stages. Perfect for website builds, web apps, and Shopify/WordPress projects.',
    icon: 'code-2',
    color: '#3366ff',
    seedConfig: {
      statuses: ['Backlog', 'Design', 'In Development', 'Code Review', 'QA Testing', 'Staging', 'Done'],
      priorities: ['Urgent', 'High', 'Medium', 'Low'],
      tags: ['Frontend', 'Backend', 'Shopify', 'WordPress', 'Bug Fix', 'Feature', 'UI/UX', 'API', 'Database', 'Performance'],
      sampleTasks: [
        { title: 'Set up project repository and CI/CD', status: 'Done', priority: 'HIGH', tags: ['Backend'] },
        { title: 'Design homepage wireframe and mockup', status: 'In Development', priority: 'HIGH', tags: ['UI/UX', 'Frontend'] },
        { title: 'Implement responsive navigation component', status: 'In Development', priority: 'MEDIUM', tags: ['Frontend'] },
        { title: 'Set up database schema and migrations', status: 'Code Review', priority: 'HIGH', tags: ['Backend', 'Database'] },
        { title: 'Build product listing page with filters', status: 'Backlog', priority: 'MEDIUM', tags: ['Frontend', 'Shopify'] },
        { title: 'Integrate payment gateway', status: 'Backlog', priority: 'URGENT', tags: ['Backend', 'API'] },
        { title: 'Performance audit and optimization', status: 'Backlog', priority: 'LOW', tags: ['Performance'] },
        { title: 'Cross-browser testing and fixes', status: 'Backlog', priority: 'MEDIUM', tags: ['QA Testing', 'Bug Fix'] },
      ],
    },
  },
  {
    name: 'Content Creation Team',
    description: 'End-to-end content workflow from ideation through review and publishing. Ideal for blog posts, copywriting, and content marketing campaigns.',
    icon: 'pen-tool',
    color: '#e85d04',
    seedConfig: {
      statuses: ['Ideas', 'Research', 'Writing', 'Editing', 'Review', 'Scheduled', 'Published'],
      priorities: ['Urgent', 'High', 'Medium', 'Low'],
      tags: ['Blog Post', 'Case Study', 'Newsletter', 'SEO', 'Copywriting', 'Landing Page', 'Email', 'Whitepaper'],
      sampleTasks: [
        { title: 'Write monthly industry trends blog post', status: 'Writing', priority: 'HIGH', tags: ['Blog Post', 'SEO'] },
        { title: 'Create client success case study — TechCorp', status: 'Research', priority: 'MEDIUM', tags: ['Case Study'] },
        { title: 'Draft Q1 newsletter content', status: 'Ideas', priority: 'LOW', tags: ['Newsletter', 'Email'] },
        { title: 'Rewrite homepage hero copy', status: 'Editing', priority: 'URGENT', tags: ['Copywriting', 'Landing Page'] },
        { title: 'SEO optimization for top 10 blog posts', status: 'Research', priority: 'MEDIUM', tags: ['SEO', 'Blog Post'] },
        { title: 'Write onboarding email sequence', status: 'Ideas', priority: 'HIGH', tags: ['Email', 'Copywriting'] },
      ],
    },
  },
  {
    name: 'Social Media & Ads Team',
    description: 'Campaign planning and execution for social media content and paid advertising. Track content calendars, ad creatives, and campaign performance.',
    icon: 'megaphone',
    color: '#9333ea',
    seedConfig: {
      statuses: ['Planning', 'Content Creation', 'Design', 'Approval', 'Scheduled', 'Live', 'Completed'],
      priorities: ['Urgent', 'High', 'Medium', 'Low'],
      tags: ['Instagram', 'Facebook', 'LinkedIn', 'Google Ads', 'Meta Ads', 'TikTok', 'Organic', 'Paid', 'Carousel', 'Reel', 'Story'],
      sampleTasks: [
        { title: 'Plan February social media calendar', status: 'Planning', priority: 'HIGH', tags: ['Instagram', 'Facebook', 'Organic'] },
        { title: 'Design carousel post — 5 Tips for Branding', status: 'Design', priority: 'MEDIUM', tags: ['Instagram', 'Carousel', 'Organic'] },
        { title: 'Set up Google Ads campaign for client launch', status: 'Content Creation', priority: 'URGENT', tags: ['Google Ads', 'Paid'] },
        { title: 'Create A/B test variations for Meta ads', status: 'Planning', priority: 'HIGH', tags: ['Meta Ads', 'Paid'] },
        { title: 'Film and edit TikTok behind-the-scenes', status: 'Content Creation', priority: 'LOW', tags: ['TikTok', 'Reel', 'Organic'] },
        { title: 'Monthly ads performance report', status: 'Planning', priority: 'MEDIUM', tags: ['Google Ads', 'Meta Ads', 'Paid'] },
      ],
    },
  },
  {
    name: 'Video Production Team',
    description: 'Video production pipeline from concept and scripting through filming, editing, and final delivery. Manage timelines, assets, and review cycles.',
    icon: 'video',
    color: '#dc2626',
    seedConfig: {
      statuses: ['Concept', 'Scripting', 'Pre-Production', 'Filming', 'Editing', 'Review', 'Final Delivery'],
      priorities: ['Urgent', 'High', 'Medium', 'Low'],
      tags: ['Promo Video', 'Testimonial', 'Tutorial', 'Motion Graphics', 'Color Grade', 'Sound Design', 'Thumbnail', 'YouTube', 'Short Form'],
      sampleTasks: [
        { title: 'Script client testimonial video', status: 'Scripting', priority: 'HIGH', tags: ['Testimonial'] },
        { title: 'Film product demo for launch campaign', status: 'Pre-Production', priority: 'URGENT', tags: ['Promo Video'] },
        { title: 'Edit agency showreel 2024', status: 'Editing', priority: 'MEDIUM', tags: ['Promo Video', 'Motion Graphics'] },
        { title: 'Create animated logo intro sequence', status: 'Concept', priority: 'LOW', tags: ['Motion Graphics'] },
        { title: 'Color grade and sound mix — Client X video', status: 'Review', priority: 'HIGH', tags: ['Color Grade', 'Sound Design'] },
        { title: 'Design YouTube thumbnails for tutorial series', status: 'Concept', priority: 'MEDIUM', tags: ['Thumbnail', 'YouTube'] },
      ],
    },
  },
  {
    name: 'Client Delivery Pipeline',
    description: 'Cross-team project delivery workflow that tracks client projects from kickoff through delivery. Coordinates between all teams for seamless handoffs.',
    icon: 'rocket',
    color: '#059669',
    seedConfig: {
      statuses: ['Incoming', 'Discovery', 'Planning', 'In Progress', 'Internal Review', 'Client Review', 'Revisions', 'Delivered'],
      priorities: ['Urgent', 'High', 'Medium', 'Low'],
      tags: ['Website', 'Branding', 'Campaign', 'Retainer', 'One-off', 'Rush', 'Milestone', 'Handoff', 'Invoice'],
      sampleTasks: [
        { title: 'Client onboarding — NewBrand Co', status: 'Discovery', priority: 'HIGH', tags: ['Branding', 'Website'] },
        { title: 'Website redesign — Phase 1 delivery', status: 'In Progress', priority: 'URGENT', tags: ['Website', 'Milestone'] },
        { title: 'Monthly retainer report — Client Y', status: 'Planning', priority: 'MEDIUM', tags: ['Retainer'] },
        { title: 'Campaign assets handoff to ads team', status: 'Internal Review', priority: 'HIGH', tags: ['Campaign', 'Handoff'] },
        { title: 'Final invoice and project closure — ProjectZ', status: 'Client Review', priority: 'LOW', tags: ['Invoice'] },
        { title: 'Rush request — Landing page for event', status: 'Incoming', priority: 'URGENT', tags: ['Website', 'Rush', 'One-off'] },
      ],
    },
  },
];

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

async function main() {
  console.log('🌱 Seeding database...\n');

  // Clear existing data
  await prisma.activityLog.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.template.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();

  console.log('📦 Cleared existing data\n');

  // Create users
  console.log('👥 Creating team members...');
  const createdUsers: Record<string, string> = {};

  for (const user of users) {
    const hash = await hashPassword(user.password);
    const created = await prisma.user.create({
      data: {
        username: user.username,
        name: user.name,
        role: user.role,
        passwordHash: hash,
        mustChangePassword: true,
      },
    });
    createdUsers[user.username] = created.id;
    console.log(`  ✓ ${user.name} (${user.username})`);
  }

  console.log('\n📋 Creating templates...');

  // Create templates
  for (const tmpl of templates) {
    await prisma.template.create({
      data: {
        name: tmpl.name,
        description: tmpl.description,
        icon: tmpl.icon,
        color: tmpl.color,
        seedConfig: tmpl.seedConfig as any,
      },
    });
    console.log(`  ✓ ${tmpl.name}`);
  }

  // Create a sample project from the first template for demo
  console.log('\n🚀 Creating sample project...');

  const webTemplate = templates[0];
  const config = webTemplate.seedConfig;

  const project = await prisma.project.create({
    data: {
      name: 'Agency Website Redesign',
      clientName: 'Aurix Lab',
      status: 'active',
      statuses: config.statuses,
      priorities: config.priorities,
      tags: config.tags,
    },
  });

  // Assign sample tasks round-robin to team members
  const memberUsernames = ['aaryan', 'ahnaf', 'mimo', 'fahim', 'ridwan', 'abir', 'quraishi', 'furqan'];
  let assigneeIndex = 0;

  for (let i = 0; i < config.sampleTasks.length; i++) {
    const task = config.sampleTasks[i];
    const assigneeUsername = memberUsernames[assigneeIndex % memberUsernames.length];
    assigneeIndex++;

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + Math.floor(Math.random() * 21) + 3);

    await prisma.task.create({
      data: {
        projectId: project.id,
        title: task.title,
        status: task.status,
        priority: task.priority as Priority,
        tags: task.tags,
        assigneeId: createdUsers[assigneeUsername],
        dueDate: dueDate,
        orderIndex: i * 1000,
      },
    });
  }

  console.log(`  ✓ Agency Website Redesign (${config.sampleTasks.length} tasks)\n`);

  console.log('═══════════════════════════════════════════');
  console.log('  ✅ Database seeded successfully!');
  console.log('═══════════════════════════════════════════');
  console.log('\n  Team Login Credentials:');
  console.log('  (Everyone must change password on first login)\n');

  for (const user of users) {
    console.log(`  ${user.name.padEnd(12)} → ${user.username} / ${user.password}`);
  }

  console.log('\n═══════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
