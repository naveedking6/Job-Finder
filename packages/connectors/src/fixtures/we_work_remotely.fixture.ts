/**
 * Representative fixture mirroring We Work Remotely's real, documented
 * RSS structure — not a captured live feed (this sandbox can't reach
 * weworkremotely.com — see docs/ADR.md Round 4 section).
 */
export const weWorkRemotelyRssFixture = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>We Work Remotely: Remote Programming Jobs</title>
<item>
  <title><![CDATA[Acme Co: Senior WordPress Developer]]></title>
  <link>https://weworkremotely.com/remote-jobs/acme-co-senior-wordpress-developer</link>
  <pubDate>Fri, 01 Aug 2026 09:00:00 +0000</pubDate>
  <description><![CDATA[<p>We are looking for an experienced WordPress developer...</p>]]></description>
  <guid isPermaLink="false">555001 at https://weworkremotely.com</guid>
  <region>Anywhere</region>
</item>
<item>
  <title><![CDATA[Odd Title With No Colon Separator]]></title>
  <link>https://weworkremotely.com/remote-jobs/odd-title-with-no-colon</link>
  <pubDate>Fri, 01 Aug 2026 10:00:00 +0000</pubDate>
  <description><![CDATA[<p>A listing that doesn't follow the Company: Title convention.</p>]]></description>
  <guid isPermaLink="false">555002 at https://weworkremotely.com</guid>
  <region>US Only</region>
</item>
</channel>
</rss>`;

export const singleItemRssFixture = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>We Work Remotely: Remote Programming Jobs</title>
<item>
  <title><![CDATA[Solo Corp: Only Job In The Feed]]></title>
  <link>https://weworkremotely.com/remote-jobs/solo-corp-only-job</link>
  <pubDate>Fri, 01 Aug 2026 11:00:00 +0000</pubDate>
  <description><![CDATA[<p>A feed with exactly one item.</p>]]></description>
  <guid isPermaLink="false">555003 at https://weworkremotely.com</guid>
  <region>Anywhere</region>
</item>
</channel>
</rss>`;
