import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.PUBLIC_SUPABASE_ANON_KEY;

if (!(supabaseUrl && supabaseKey)) {
  console.error("Missing Supabase environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const seedItems = [
  {
    title: "Arduino Uno Rev3",
    description:
      "Microcontroller board based on the ATmega328P with 14 digital I/O pins",
    tags: ["microcontroller", "arduino", "prototyping"],
    status: "available",
    location: "Lab A - Cabinet 1",
    notes: null,
    assignee: null,
  },
  {
    title: "Raspberry Pi 4 Model B (4GB)",
    description: "Single-board computer with quad-core processor and 4GB RAM",
    tags: ["raspberry-pi", "computer", "linux"],
    status: "checked_out",
    location: "Lab B - Shelf 2",
    notes: "Project: IoT Gateway",
    assignee: "student@example.com",
  },
  {
    title: "ESP32 DevKitC",
    description: "WiFi and Bluetooth enabled microcontroller development board",
    tags: ["esp32", "wifi", "bluetooth", "iot"],
    status: "available",
    location: "Lab A - Cabinet 1",
    notes: null,
    assignee: null,
  },
  {
    title: "Digital Multimeter",
    description: "Fluke 117 True-RMS multimeter for electrical measurements",
    tags: ["measurement", "tools", "electronics"],
    status: "available",
    location: "Lab A - Tool Station",
    notes: null,
    assignee: null,
  },
  {
    title: "Soldering Station",
    description:
      "Weller WES51 analog soldering station with temperature control",
    tags: ["tools", "soldering"],
    status: "available",
    location: "Lab A - Workbench 3",
    notes: null,
    assignee: null,
  },
  {
    title: "Oscilloscope Rigol DS1054Z",
    description: "50MHz 4-channel digital oscilloscope",
    tags: ["measurement", "oscilloscope", "tools"],
    status: "checked_out",
    location: "Lab B - Test Equipment",
    notes: "Senior design project - return by end of term",
    assignee: "seniorteam@example.com",
  },
  {
    title: "FPGA Development Board",
    description: "Basys 3 Artix-7 FPGA Trainer Board",
    tags: ["fpga", "xilinx", "digital-design"],
    status: "available",
    location: "Lab C - Cabinet 2",
    notes: null,
    assignee: null,
  },
  {
    title: "Logic Analyzer",
    description: "Saleae Logic 8 - 8 channel USB logic analyzer",
    tags: ["measurement", "debugging", "digital"],
    status: "available",
    location: "Lab B - Test Equipment",
    notes: null,
    assignee: null,
  },
  {
    title: "Breadboard Kit",
    description: "Large breadboard with jumper wires and component organizer",
    tags: ["prototyping", "breadboard"],
    status: "retired",
    location: "Storage - Level 2",
    notes: "Damaged - needs replacement",
    assignee: null,
  },
  {
    title: "3D Printer - Prusa i3 MK3S",
    description: "FDM 3D printer with auto bed leveling",
    tags: ["3d-printing", "manufacturing", "prototyping"],
    status: "available",
    location: "Maker Space - Corner Bay",
    notes: null,
    assignee: null,
  },
];

async function seed() {
  console.log("Starting database seed...");

  // Clear existing items (optional - comment out if you want to keep existing data)
  console.log("Clearing existing items...");
  const { error: deleteError } = await supabase
    .from("items")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all

  if (deleteError) {
    console.error("Error clearing items:", deleteError);
  }

  // Insert seed data
  console.log(`Inserting ${seedItems.length} items...`);
  const { data, error } = await supabase
    .from("items")
    .insert(seedItems)
    .select();

  if (error) {
    console.error("Error seeding items:", error);
    process.exit(1);
  }

  console.log(`Successfully seeded ${data.length} items!`);
  console.log("Seed data:");
  data.forEach((item) => {
    console.log(`  - ${item.title} (${item.status})`);
  });
}

seed().catch(console.error);
