"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Test script to verify contact-agent associations and birthday extraction
 */
const core_1 = require("@macp/core");
const drizzle_orm_1 = require("drizzle-orm");
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://macp:macp_dev_password@macp-dev-db.cluster-ctm0gsiqglgd.us-east-1.rds.amazonaws.com:5432/macp';
async function test() {
    console.log('Initializing database...');
    (0, core_1.createDatabase)({ connectionString: DATABASE_URL });
    const db = (0, core_1.getDatabase)();
    // 1. Find contacts with "Jane" in the name
    console.log('\n=== Looking for Jane contacts ===');
    const allContacts = await db.select().from(core_1.contacts);
    const janeContacts = allContacts.filter((c) => c.name.toLowerCase().includes('jane'));
    console.log('Jane contacts:', janeContacts.length);
    janeContacts.forEach((c) => {
        console.log(`  - ${c.id}: ${c.name}, birthday: ${c.birthday || 'NOT SET'}, userId: ${c.userId}`);
    });
    // 2. Check contact_agents for test-jane-girlfriend
    console.log('\n=== Looking for test-jane-girlfriend associations ===');
    const agentAssociations = await db.select().from(core_1.contactAgents).where((0, drizzle_orm_1.eq)(core_1.contactAgents.publicAgentId, 'test-jane-girlfriend'));
    console.log('Agent associations:', agentAssociations.length);
    agentAssociations.forEach((a) => {
        console.log(`  - contactId: ${a.contactId}, agentName: ${a.agentName}`);
    });
    // 3. If association exists, get the contact details
    if (agentAssociations.length > 0) {
        const contactId = agentAssociations[0].contactId;
        console.log('\n=== Contact linked to test-jane-girlfriend ===');
        const linkedContact = await db.select().from(core_1.contacts).where((0, drizzle_orm_1.eq)(core_1.contacts.id, contactId));
        if (linkedContact.length > 0) {
            const c = linkedContact[0];
            console.log(`  Name: ${c.name}`);
            console.log(`  Birthday: ${c.birthday || 'NOT SET'}`);
            console.log(`  Notes: ${c.notes || 'none'}`);
        }
    }
    else {
        console.log('\n!!! NO ASSOCIATION FOUND - This is why birthday is not being saved !!!');
        console.log('The agent test-jane-girlfriend is not linked to any contact.');
    }
    // 4. Test birthday extraction patterns
    console.log('\n=== Testing birthday extraction ===');
    const testCases = [
        "Jane's birthday is February 14th!",
        "Jane's birthday is March 15",
        "birthday is 02-14",
    ];
    for (const text of testCases) {
        const birthday = extractBirthday(text);
        console.log(`  Input: "${text}"`);
        console.log(`  Result: ${birthday || 'NO MATCH'}`);
    }
    process.exit(0);
}
function extractBirthday(text) {
    const monthMap = {
        january: '01', february: '02', march: '03', april: '04',
        may: '05', june: '06', july: '07', august: '08',
        september: '09', october: '10', november: '11', december: '12'
    };
    // Pattern: "birthday is February 14th"
    const monthDayMatch = text.match(/birthday\s+(?:is\s+)?(?:on\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?/i);
    if (monthDayMatch) {
        const month = monthMap[monthDayMatch[1].toLowerCase()];
        const day = String(parseInt(monthDayMatch[2], 10)).padStart(2, '0');
        return `${month}-${day}`;
    }
    return null;
}
test().catch(console.error);
//# sourceMappingURL=test-contact-flow.js.map