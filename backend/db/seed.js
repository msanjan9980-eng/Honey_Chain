import 'dotenv/config';
import { db, initSchema } from './database.js';

initSchema();

// Wipe and re-seed (idempotent for demo)
db.exec(`
  DELETE FROM sensor_readings;
  DELETE FROM batch_events;
  DELETE FROM batches;
  DELETE FROM hives;
  DELETE FROM beekeepers;
  DELETE FROM sqlite_sequence WHERE name IN ('batch_events','sensor_readings');
`);

const insertBeekeeper = db.prepare(
  `INSERT INTO beekeepers (id, name, location, phone) VALUES (?, ?, ?, ?)`
);
const insertHive = db.prepare(
  `INSERT INTO hives (id, beekeeper_id, name, latitude, longitude, current_health, current_weight)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
const insertBatch = db.prepare(
  `INSERT INTO batches
     (id, hive_id, beekeeper_id, harvest_date, location, health_at_harvest, health_label,
      weight_kg, moisture_pct, onchain_hash, block_number, ipfs_cid, status)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertEvent = db.prepare(
  `INSERT INTO batch_events (batch_id, event_type, event_date, location, actor, notes, onchain_tx)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
const insertReading = db.prepare(
  `INSERT INTO sensor_readings (hive_id, recorded_at, temperature_c, humidity_pct, weight_kg, audio_health_score)
   VALUES (?, ?, ?, ?, ?, ?)`
);

const seed = db.transaction(() => {
  insertBeekeeper.run(1, 'Ravi Kumar',   'Mandya, Karnataka',   '+91-98xxxxxxx1');
  insertBeekeeper.run(2, 'Ramesh Patel', 'Kutch, Gujarat',      '+91-98xxxxxxx2');
  insertBeekeeper.run(3, 'Sunita Devi',  'Sundarbans, WB',      '+91-98xxxxxxx3');

  insertHive.run('HC-0247', 1, 'Mandya Hive 1',   12.5218, 76.8951, 94.8, 42.8);
  insertHive.run('HC-0311', 2, 'Kutch Hive 3',    23.2420, 69.6669, 92.1, 39.4);
  insertHive.run('HC-0129', 3, 'Sundarbans Hive', 21.9497, 88.9000, 88.4, 36.1);

  insertBatch.run(
    'HC-2026-0842', 'HC-0247', 1, '08 Sep 2026', 'Mandya, Karnataka',
    94.8, 'Healthy', 18.6, 17.2, '0x8f4c9a2e71b4d3f60188c2a5b6d9e0f4a1c8…91ab27',
    8421, 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi', 'verified'
  );
  insertBatch.run(
    'HC-2026-0417', 'HC-0311', 2, '17 Apr 2026', 'Kutch, Gujarat',
    92.1, 'Healthy', 16.4, 17.8, '0x3a91f4c8e2b6d7a0f5c3e1b9a8d4f2c7e6b0…4d02fe',
    5217, 'bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku', 'verified'
  );
  insertBatch.run(
    'HC-2026-0523', 'HC-0129', 3, '23 May 2026', 'Sundarbans, WB',
    88.4, 'Healthy', 14.2, 18.4, '0x7c2e8a1f9b4d6e0a3c5f7b2d8e1a4c6f9b3e…a71c05',
    6394, 'bafybeif7ztnhj4ojvzssyitxr2z6svmhzz5jf2ybmqxwvyd7cyzpqgvxfy', 'verified'
  );

  // Events for HC-2026-0842
  insertEvent.run('HC-2026-0842', 'harvested',            '08 Sep 2026', 'Mandya, Karnataka', 'Ravi Kumar',  'Raw honey harvested from Hive HC-0247', '0xa1f3…8b21');
  insertEvent.run('HC-2026-0842', 'extracted_and_tested', '09 Sep 2026', 'Mandya, Karnataka', 'Quality Lab', 'Moisture 17.2%, purity check passed',   '0xc4d7…9e02');
  insertEvent.run('HC-2026-0842', 'packaged',             '09 Sep 2026', 'Mandya, Karnataka', 'Packing Unit','Batch sealed, 12 jars',                 '0xe8b1…4f77');
  insertEvent.run('HC-2026-0842', 'shipped',              '10 Sep 2026', 'In transit',        'Logistics',   'Dispatched to Bengaluru distribution',  '0xf2a9…1c33');

  // Events for HC-2026-0417
  insertEvent.run('HC-2026-0417', 'harvested',            '17 Apr 2026', 'Kutch, Gujarat',    'Ramesh Patel', 'Harvest from Hive HC-0311',    '0x1a3c…6d91');
  insertEvent.run('HC-2026-0417', 'extracted_and_tested', '18 Apr 2026', 'Kutch, Gujarat',    'Quality Lab',  'Purity and moisture passed',   '0x2b4d…7e02');
  insertEvent.run('HC-2026-0417', 'packaged',             '18 Apr 2026', 'Kutch, Gujarat',    'Packing Unit', 'Batch sealed, 10 jars',        '0x3c5e…8f13');

  // Events for HC-2026-0523
  insertEvent.run('HC-2026-0523', 'harvested',            '23 May 2026', 'Sundarbans, WB',    'Sunita Devi',  'Harvest from Hive HC-0129',    '0x4d6f…9a24');
  insertEvent.run('HC-2026-0523', 'extracted_and_tested', '24 May 2026', 'Sundarbans, WB',    'Quality Lab',  'Purity passed',                '0x5e7a…0b35');
  insertEvent.run('HC-2026-0523', 'packaged',             '24 May 2026', 'Sundarbans, WB',    'Packing Unit', 'Batch sealed, 8 jars',         '0x6f8b…1c46');
  insertEvent.run('HC-2026-0523', 'shipped',              '25 May 2026', 'In transit',        'Logistics',    'Dispatched to Kolkata',        '0x7a9c…2d57');

  // Sensor readings — 7 days of data for the Karnataka hive
  const today = new Date('2026-09-10T08:00:00Z');
  const weights = [34, 36, 35, 38, 40, 42, 44];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    insertReading.run(
      'HC-0247',
      d.toISOString(),
      +(33 + Math.random() * 2).toFixed(1),
      +(66 + Math.random() * 4).toFixed(1),
      weights[i],
      +(0.9 + Math.random() * 0.09).toFixed(3)
    );
  }
});

seed();
console.log('✅ Database seeded successfully.');