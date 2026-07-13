-- "Restaurants" -> "Restaurant" (singular), per user request.
update tags set name = 'Restaurant' where kind = 'tag' and name = 'Restaurants';
