USE %s;

LOAD DATA LOCAL INFILE '%s'
INTO TABLE hierarchy
CHARACTER SET 'UTF8'
(parentId, childId, type);
