import express from "express";
import { Prisma, PrismaClient } from "@prisma/client";
import { json as jsonParser } from "body-parser";
import slugify from "slugify";
import isAddress from "~/middlewares/isAddress";
import { collectTags, countPlayEvents, timestampToNumber } from "~/utils";
import isAuthorized from "~/middlewares/isAuthorized";
import { PLAYLIST_FIELDS } from "~/config";

const prisma = new PrismaClient();
const router = express.Router();

router.use(jsonParser());

router.get("/:address", isAddress, async (req, res) => {
  const { address } = req.params;

  await prisma.playlist
    .findMany({
      where: {
        userId: address,
      },
      select: PLAYLIST_FIELDS,
    })
    .then((playlists) =>
      playlists.map((playlist) => ({
        ...playlist,
        createdAt: +playlist.createdAt,
        updatedAt: +playlist.updatedAt,
        tracks: playlist.tracks.map(({ track }) =>
          collectTags(countPlayEvents(timestampToNumber(track)))
        ),
      }))
    )
    .then((playlists) => {
      return res.status(200).json({ playlists });
    })
    .catch((e) => {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        console.log(`Prisma Error ${e.code}: ${e.message}`);
        return res.status(400).json({ error: "Playlist request error" });
      } else {
        console.log(e);
        return res.status(400).json({ error: "Unknown Error" });
      }
    });
});

router.get("/:address/:slug", isAddress, async (req, res) => {
  const { address, slug } = req.params;

  await prisma.playlist
    .findUniqueOrThrow({
      where: {
        userId_slug: { userId: address, slug },
      },
      select: PLAYLIST_FIELDS,
    })
    .then((playlist) => ({
      ...playlist,
      createdAt: +playlist.createdAt,
      updatedAt: +playlist.updatedAt,
      tracks: playlist.tracks.map(({ track }) =>
        collectTags(countPlayEvents(timestampToNumber(track)))
      ),
    }))
    .then((playlist) => {
      return res.status(200).json({ playlist });
    })
    .catch((e) => {
      if (e.code === "P2025") {
        return res.status(404).json({ error: "Playlist not found" });
      } else if (e instanceof Prisma.PrismaClientKnownRequestError) {
        console.log(`Prisma Error ${e.code}: ${e.message}`);
        return res.status(400).json({ error: "Playlist request error" });
      } else {
        console.log(e);
        return res.status(400).json({ error: "Unknown Error" });
      }
    });
});

// Create new playlist
router.post("/:address", isAuthorized, isAddress, async (req, res) => {
  const { address } = req.params;
  const { title } = req.body;

  if (address !== res.locals.address) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Validation
  // ========================================
  if (!title) {
    return res.status(400).json({
      error: "Invalid data",
    });
  }
  // ========================================

  const slug = slugify(title, { lower: true, strict: true });

  await prisma.playlist
    .create({
      data: {
        user: { connect: { address } },
        title,
        slug,
      },
      select: {
        ...PLAYLIST_FIELDS,
        tracks: false,
      },
    })
    .then((playlist) => ({
      ...playlist,
      createdAt: +playlist.createdAt,
      updatedAt: +playlist.updatedAt,
      tracks: [],
    }))
    .then((playlist) => {
      return res.status(200).json({ playlist });
    })
    .catch((e) => {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        console.log(`Prisma Error ${e.code}: ${e.message}`);
        return res.status(400).json({ error: "Playlist creation error" });
      } else {
        console.log(e);
        return res.status(400).json({ error: "Unknown Error" });
      }
    });
});

// Edit playlist
router.put("/:address/:slug", isAuthorized, isAddress, async (req, res) => {
  const { address, slug } = req.params;
  const { title } = req.body;

  if (address !== res.locals.address) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Validation
  // ========================================
  if (!title) {
    return res.status(400).json({
      error: "Invalid data",
    });
  }
  // ========================================

  const newSlug = slugify(title, { lower: true, strict: true });

  await prisma.playlist
    .update({
      where: { userId_slug: { userId: address, slug } },
      data: {
        title,
        slug: newSlug,
      },
      select: PLAYLIST_FIELDS,
    })
    .then((playlist) => ({
      ...playlist,
      createdAt: +playlist.createdAt,
      updatedAt: +playlist.updatedAt,
    }))
    .then((playlist) => {
      return res.status(200).json({ playlist });
    })
    .catch((e) => {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        console.log(`Prisma Error ${e.code}: ${e.message}`);
        return res.status(400).json({ error: "Playlist creation error" });
      } else {
        console.log(e);
        return res.status(400).json({ error: "Unknown Error" });
      }
    });
});

// Delete playlist
router.delete("/:address/:slug", isAuthorized, isAddress, async (req, res) => {
  const { address, slug } = req.params;

  if (address !== res.locals.address) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  await prisma.playlist
    .delete({
      where: { userId_slug: { userId: address, slug } },
    })
    .then(() => {
      return res.status(200).json({ ok: true });
    })
    .catch((e) => {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        console.log(`Prisma Error ${e.code}: ${e.message}`);
        return res.status(400).json({ error: "Playlist deletion error" });
      } else {
        console.log(e);
        return res.status(400).json({ error: "Unknown Error" });
      }
    });
});

// Add track to playlist
router.post("/:address/:slug", isAuthorized, isAddress, async (req, res) => {
  const { address, slug } = req.params;
  const { trackId } = req.body;

  if (address !== res.locals.address) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Validation
  // ========================================
  if (!trackId) {
    return res.status(400).json({
      error: "Invalid data",
    });
  }
  // ========================================

  await prisma.tracksInPlaylists
    .create({
      data: {
        track: { connect: { id: trackId } },
        playlist: {
          connect: { userId_slug: { slug, userId: address } },
        },
      },
      select: {
        playlist: {
          select: PLAYLIST_FIELDS,
        },
      },
    })
    .then((playlist) => playlist.playlist)
    .then((playlist) => ({
      ...playlist,
      createdAt: +playlist.createdAt,
      updatedAt: +playlist.updatedAt,
      tracks: playlist.tracks.map(({ track }) =>
        collectTags(countPlayEvents(timestampToNumber(track)))
      ),
    }))
    .then((playlist) => {
      return res.status(200).json({ playlist });
    })
    .catch((e) => {
      if (e.code === "P2002") {
        return res.status(400).json({ error: "Track already in the playlist" });
      } else if (e instanceof Prisma.PrismaClientKnownRequestError) {
        console.log(`Prisma Error ${e.code}: ${e.message}`);
        return res.status(400).json({ error: "Playlist updating error" });
      } else {
        console.log(e);
        return res.status(400).json({ error: "Unknown Error" });
      }
    });
});

export default router;
