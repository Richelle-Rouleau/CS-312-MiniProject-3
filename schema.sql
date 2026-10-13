CREATE TABLE IF NOT EXISTS users (
    user_id VARCHAR(255) PRIMARY KEY,
    password VARCHAR(255),
    name VARCHAR(255)
);

CREATE UNIQUE INDEX IF NOT EXISTS users_name_unique_idx
ON users (LOWER(name));

CREATE TABLE IF NOT EXISTS blogs (
    blog_id SERIAL PRIMARY KEY,
    creator_name VARCHAR(255),
    creator_user_id VARCHAR(255) REFERENCES users(user_id),
    title VARCHAR(255),
    body TEXT,
    date_created TIMESTAMP
);

INSERT INTO users (user_id, password, name)
VALUES 
('user-1', '12345', 'Otterhound Lover'),
('user-2', 'abcdef', 'Kennel Club'),
('user-3', 'easy', 'Dog Lover');

INSERT INTO blogs (creator_name, creator_user_id, title, body, date_created)
VALUES
('Otterhound Lover', 'user-1', 'The Otterhound', 'Otterhounds are noble, ancient scent hounds that are ""class clowns"" at heart with a deep hound bay...A-rooooo!  They  are wonderful family companions, good with kids and animals, and adapt to their environment and surroundings remarkably well. -otterhound.org', '2026-10-12 02:35:00'),
('Kennel Club', 'user-2', 'The Royal Kennel Club', 'The Royal Kennel Club is the official kennel club of the United Kingdom.', '2026-10-12 02:38:00'),
('Dog Lover', 'user-3', 'The Pug', 'Once the mischievous companion of Chinese emperors, and later the mascot of Holland''s royal House of Orange, the small but solid Pug is today adored by his millions of fans around the world. -AKC', '2026-10-12 02:42:00'),
('Dog Lover', 'user-3', 'The German Pinscher', 'The sleek, no-frills German Pinscher is among Germany''s oldest breeds and the prototype of other pinscher breeds. -AKC', '2026-10-12 02:45:00'),
('Dog Lover', 'user-3', 'The Chinook', 'The pride of Wonalancet, New Hampshire, the Chinook is a rugged working dog and devoted family pet known for intelligence, patience, and eagerness to please. -AKC', '2026-10-12 02:46:00');