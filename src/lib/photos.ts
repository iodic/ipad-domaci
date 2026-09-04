import fs from "node:fs";
import path from "node:path";

export const categories = [
  { slug: "luka", name: "Luka" },
  { slug: "vanja", name: "Vanja" },
] as const;

export type CategorySlug = (typeof categories)[number]["slug"];

export interface Photo {
  filename: string;
  url: string;
  thumbnailUrl: string;
}

export interface PhotoPost {
  category: CategorySlug;
  date: string;
  title: string;
  photos: Photo[];
}

const photosRoot = path.join(process.cwd(), "public", "photos");
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const imagePattern = /\.(jpe?g|png)$/i;
const thumbnailPattern = /\.thumb\.(jpe?g|png)$/i;

export function formatDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function getPosts(category: CategorySlug): PhotoPost[] {
  const categoryDirectory = path.join(photosRoot, category);

  if (!fs.existsSync(categoryDirectory)) {
    return [];
  }

  return fs
    .readdirSync(categoryDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && datePattern.test(entry.name))
    .map((entry) => buildPost(category, entry.name))
    .filter((post) => post.photos.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function getAllPosts(): PhotoPost[] {
  return categories.flatMap((category) => getPosts(category.slug));
}

function buildPost(category: CategorySlug, date: string): PhotoPost {
  const directory = path.join(photosRoot, category, date);
  const filenames = fs
    .readdirSync(directory)
    .filter(
      (filename) => imagePattern.test(filename) && !thumbnailPattern.test(filename),
    )
    .sort((a, b) => a.localeCompare(b));

  const photos = filenames.flatMap((filename): Photo[] => {
    const extension = path.extname(filename);
    const stem = filename.slice(0, -extension.length);
    const thumbnailFilename = `${stem}.thumb${extension}`;

    if (!fs.existsSync(path.join(directory, thumbnailFilename))) {
      return [];
    }

    const baseUrl = `/photos/${category}/${date}`;
    return [
      {
        filename,
        url: `${baseUrl}/${encodeURIComponent(filename)}`,
        thumbnailUrl: `${baseUrl}/${encodeURIComponent(thumbnailFilename)}`,
      },
    ];
  });

  return {
    category,
    date,
    title: formatDate(date),
    photos,
  };
}
