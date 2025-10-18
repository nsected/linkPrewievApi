import metascraper from "metascraper";
import metascraperTitle from "metascraper-title";
import metascraperDescription from "metascraper-description";
import metascraperImage from "metascraper-image";
import metascraperLogo from "metascraper-logo";
import metascraperUrl from "metascraper-url";
import metascraperAuthor from "metascraper-author";
import metascraperPublisher from "metascraper-publisher";
import metascraperDate from "metascraper-date";
import * as cheerio from "cheerio";
import { debug } from "../utils/debugHandler.js";

const scraper = metascraper([
    metascraperTitle(),
    metascraperDescription(),
    metascraperImage(),
    metascraperLogo(),
    metascraperUrl(),
    metascraperAuthor(),
    metascraperPublisher(),
    metascraperDate(),
]);

export async function parseMetadata(html, url) {
    debug(`🔍 Extracting metadata for ${url}`);

    try {
        const metadata = await scraper({ html, url });
        const $ = cheerio.load(html);

        // ============================
        // 🟠 FALLBACK FOR TITLE
        // ============================
        if (!metadata?.title) {
            debug("🟠 [FALLBACK] No title from metascraper — trying HTML sources...");

            let title =
                $("title").first().text().trim() ||
                $('meta[property="og:title"]').attr("content")?.trim() ||
                $("h1").first().text().trim();

            if (title) {
                metadata.title = title.slice(0, 200);
                debug(`🟠 [FALLBACK] Title extracted: "${metadata.title}"`);
            } else {
                debug("🟠 [FALLBACK] No title found in HTML.");
            }
        }

        // ============================
        // 🟠 FALLBACK FOR DESCRIPTION
        // ============================
        if (!metadata?.description) {
            debug("🟠 [FALLBACK] No description from metascraper — trying <p> tags...");

            let paragraphText = "";
            $("p").each((_, el) => {
                const text = $(el).text().trim();
                if (text && text.length > 60) {
                    paragraphText = text.replace(/\s+/g, " ").slice(0, 400);
                    return false; // break
                }
            });

            if (paragraphText) {
                metadata.description = paragraphText;
                debug(`🟠 [FALLBACK] Description extracted: "${paragraphText.slice(0, 200)}..."`);
            } else {
                debug("🟠 [FALLBACK] No suitable <p> found for description.");
            }
        }

        debug("✅ Metadata extracted (with fallback if needed):", metadata);
        return metadata;
    } catch (err) {
        debug("❌ Metadata extraction failed:", err.message);
        return {};
    }
}
