/**
 * 24/7 Autonomous GES & National Education Cloud Watcher
 * 
 * Fetches live RSS feeds and educational circulars from Ghanaian education portals,
 * filters for new articles, categorizes them, and writes them directly to Supabase.
 */

import { createClient } from '@supabase/supabase-js';

// Configuration
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://iomlghdphvovxwqfqwgs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_KEY) {
  console.error('[GES Cloud Watcher] Error: SUPABASE_KEY or VITE_SUPABASE_ANON_KEY is missing in environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Verified Ghanaian Education Feeds & Endpoints
const WATCHER_FEEDS = [
  {
    sourceId: 'ghanaeducation',
    sourceName: 'GhanaEducation.org',
    feedUrl: 'https://ghanaeducation.org/feed/',
    baseUrl: 'https://ghanaeducation.org'
  },
  {
    sourceId: 'ges',
    sourceName: 'Ghana Education Service (GES)',
    feedUrl: 'https://ges.gov.gh/feed/',
    baseUrl: 'https://ges.gov.gh'
  },
  {
    sourceId: 'moe',
    sourceName: 'Ministry of Education (MoE)',
    feedUrl: 'https://moe.gov.gh/feed/',
    baseUrl: 'https://moe.gov.gh'
  },
  {
    sourceId: 'ghanaeducationnews',
    sourceName: 'GhanaEducationNews.org',
    feedUrl: 'https://ghanaeducationnews.org/feed/',
    baseUrl: 'https://ghanaeducationnews.org'
  }
];

// Helper to determine category & urgency from title and summary
function categorizeArticle(title, summary) {
  const text = `${title} ${summary}`.toLowerCase();
  
  if (text.includes('bece') || text.includes('wassce') || text.includes('waec') || text.includes('exam')) {
    return { category: 'Examinations (BECE & WASSCE)', urgency: 'urgent', targetAudience: 'all' };
  }
  if (text.includes('continuous assessment') || text.includes('sba') || text.includes('marks') || text.includes('grading') || text.includes('curriculum') || text.includes('nacca')) {
    return { category: 'Curriculum & Assessment Policy', urgency: 'high', targetAudience: 'teacher' };
  }
  if (text.includes('vacation') || text.includes('calendar') || text.includes('reopening') || text.includes('midterm') || text.includes('holiday')) {
    return { category: 'Academic Calendar', urgency: 'high', targetAudience: 'all' };
  }
  if (text.includes('ntc') || text.includes('licensing') || text.includes('cpd') || text.includes('gtle') || text.includes('teacher portal')) {
    return { category: 'Teacher Licensing & CPD', urgency: 'medium', targetAudience: 'teacher' };
  }
  if (text.includes('directive') || text.includes('circular') || text.includes('management') || text.includes('headteacher')) {
    return { category: 'Management & Directives', urgency: 'high', targetAudience: 'headteacher' };
  }
  return { category: 'General Education News', urgency: 'info', targetAudience: 'all' };
}

// Simple XML / RSS parser without heavy external dependencies
function parseXmlItems(xmlText, source) {
  const items = [];
  const itemMatches = xmlText.match(/<item[\s\S]*?<\/item>/gi) || [];

  for (const itemXml of itemMatches) {
    const titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/title>/i);
    const linkMatch = itemXml.match(/<link>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/link>/i);
    const pubDateMatch = itemXml.match(/<pubDate>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/pubDate>/i);
    const descMatch = itemXml.match(/<description>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/description>/i);

    const title = (titleMatch ? (titleMatch[1] || titleMatch[2]) : '').trim();
    const link = (linkMatch ? (linkMatch[1] || linkMatch[2]) : '').trim();
    const pubDate = (pubDateMatch ? (pubDateMatch[1] || pubDateMatch[2]) : new Date().toISOString()).trim();
    let desc = (descMatch ? (descMatch[1] || descMatch[2]) : '').trim();

    // Clean HTML tags and entities from description
    desc = desc.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').replace(/&#8217;/g, "'").replace(/&#8230;/g, '...').slice(0, 300);

    if (title && link) {
      const { category, urgency, targetAudience } = categorizeArticle(title, desc);
      
      // Hash simple unique ID from link
      const id = `${source.sourceId}_${Buffer.from(link).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 32)}`;

      items.push({
        id,
        source_id: source.sourceId,
        source_name: source.sourceName,
        title,
        summary: desc || `Read official circular on ${source.sourceName}.`,
        published_date: new Date(pubDate).toISOString(),
        source_url: link,
        category,
        urgency,
        target_audience: targetAudience,
        is_breaking: urgency === 'urgent' || urgency === 'high'
      });
    }
  }

  return items;
}

async function runAutonomousScan() {
  console.log(`[GES Cloud Watcher] Starting 24/7 Autonomous Scan at ${new Date().toISOString()}...`);
  let totalDiscovered = 0;
  let totalSaved = 0;

  for (const source of WATCHER_FEEDS) {
    try {
      console.log(`[GES Cloud Watcher] Fetching feed for ${source.sourceName}...`);
      const response = await fetch(source.feedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LabourEduEducationRadar/1.0'
        },
        signal: AbortSignal.timeout(12000)
      });

      if (!response.ok) {
        console.warn(`[GES Cloud Watcher] Could not fetch ${source.feedUrl} (Status: ${response.status})`);
        continue;
      }

      const xmlText = await response.text();
      const parsedItems = parseXmlItems(xmlText, source);
      totalDiscovered += parsedItems.length;

      console.log(`[GES Cloud Watcher] Found ${parsedItems.length} circulars from ${source.sourceName}.`);

      // Upsert into Supabase
      if (parsedItems.length > 0) {
        const { error } = await supabase
          .from('platform_ges_radar_news')
          .upsert(parsedItems.slice(0, 15), { onConflict: 'id', ignoreDuplicates: true });

        if (error) {
          console.warn(`[GES Cloud Watcher] Supabase upsert note for ${source.sourceName}:`, error.message);
        } else {
          totalSaved += parsedItems.length;
        }
      }
    } catch (err) {
      console.warn(`[GES Cloud Watcher] Error scanning ${source.sourceName}:`, err.message);
    }
  }

  console.log(`[GES Cloud Watcher] Scan completed successfully. Discovered: ${totalDiscovered}, Processed: ${totalSaved}.`);
}

runAutonomousScan();
