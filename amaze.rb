#!/usr/bin/env ruby

class Amaze

  def initialize(width, height)
    # Dimensions
    @width = width
    @height = height
    # Maze storage
    @maze = []
    # Possible entrances
    @candidates = []
    # Randomized entrances
    @entrances = []
    # Positions in maze
    @x = 0
    @y = 0
  end

  # Recursive wall inspection
  def inspect_walls_around(x, y)
    # This room is connected
    @connected_rooms[y][x] = 1
    # north
    if @maze[y - 1][x] == :opening && y != 1
      if @connected_rooms[y - 2][x] == 0
        inspect_walls_around(x, y - 2)
      end
    end
    # east
    if @maze[y][x + 1] == :opening && x != @width * 2 - 1
      if @connected_rooms[y][x + 2] == 0
        inspect_walls_around(x + 2, y)
      end
    end
    # south
    if @maze[y + 1][x] == :opening && y != @height * 2 - 1
      if @connected_rooms[y + 2][x] == 0
        inspect_walls_around(x, y + 2)
      end
    end
    # west
    if @maze[y][x - 1] == :opening && x != 1
      if @connected_rooms[y][x - 2] == 0
        inspect_walls_around(x - 2, y)
      end
    end
  end

  def all_rooms_connected?
    rows = @height * 2 + 1
    cols = @width * 2 + 1
    @connected_rooms = Array.new(rows) { Array.new(cols, 0) }

    # Find first room
    case @entrances.first[0] # x-coordinate
      when 0           then x = 1
      when @width * 2  then x = @width * 2 - 1
      else                  x = @entrances.first[0]
    end

    case @entrances.first[1] # y-coordinate
      when 0           then y = 1
      when @height * 2 then y = @height * 2 - 1
      else                  y = @entrances.first[1]
    end
    # Begin rescursive search for rooms
    inspect_walls_around(y, x)

    # Summarize all 1:s to determine if some rooms can't be reached
    sum = 0
    @connected_rooms.each do |row|
      sum += row.inject(:+)
    end
    return sum == @width * @height ? true : false
  end

  def create_outer_walls
    # All rows
    (@height * 2 + 1).times do |row| 
      @maze[row] = []
      @maze[row] << (row % 2 == 0 ? :corner : :wall)
    end

    # Fill first and last row
    @width.times do
      @maze[0]          << :wall << :corner
      @maze[@height * 2] << :wall << :corner
    end

    # All inner rows
    1.upto(@height * 2 - 1) do |row|

      (@width - 1).times do 
        if row % 2 == 0
          @maze[row] << :opening << :corner
        else
          @maze[row] << :room << :opening
        end
      end

      if row % 2 == 0
        @maze[row] << :opening << :corner
      else
        @maze[row] << :room << :wall
      end
    end
  end


  def create_entrances

    # top/bottom
    (1..@width * 2 - 1).step(2) do |n|
      @candidates.push [n, 0]
      @candidates.push [n, @height * 2]
    end
    # left/right
    (1..@height * 2 - 1).step(2) do |n|
      @candidates.push [0, n]
      @candidates.push [@width * 2, n]
    end

    2.times do
      random = ""
      loop do
        random = rand(@candidates.length)
        break unless @entrances.include? random
      end
      @entrances.push @candidates[random]

      @maze[@entrances.last[1]][@entrances.last[0]] = :entrance
    end
  end

  def place_inner_walls

    # List of places walls that can be placed
    @inner_wall_places = []

    (1..@height * 2 - 1).step(2) do |row|
      (2..@width * 2 - 2).step(2) do |col|
        @inner_wall_places.push [row, col]
      end
    end

    (2..@height * 2 - 2).step(2) do |row|
      (1..@width * 2 - 1).step(2) do |col|
        @inner_wall_places.push [row, col]
      end
    end

    # Continue filling maze with walls while all rooms are still connected
    while ! @inner_wall_places.empty?

      wall = @inner_wall_places.slice! rand(@inner_wall_places.length)

      if @maze[wall[0]][wall[1]] == :opening
        
        @maze[wall[0]][wall[1]] = :wall

        unless all_rooms_connected?
          @maze[wall[0]][wall[1]] = :opening
        end
      end
    end
  end

  def render
    r = 0
    @maze.each do |row|
      row.each do |cell|
        print case cell
          when :corner   then "o"
          when :wall     then r % 2 == 0 ? "---" : "|"
          when :room     then "   "
          when :opening  then r % 2 == 0 ? "   " : " "
          when :entrance then r % 2 == 0 ? "   " : " "
          when :exit     then "$"
          else "\nDon't know how to render #{cell}\n"
        end
      end
      r += 1
      puts
    end
  end

  def render_symbols
    require('json')
    puts JSON.dump(@maze)
    # @maze.each do |row|
    #   print "#{row}\n"
    # end
  end

  def render_connected_rooms
    (1..@connected_rooms[0].length - 1).step(2) do |row|
      (1..@connected_rooms.length - 1).step(2) do |col|
        print @connected_rooms[row][col] == 1 ? 'o ' : '  '
      end
      puts
    end
  end
end

# Validate arguments
abort("Usage #{$0} <width> <height> [json]") unless ARGV.length >= 2
abort("Usage #{$0} <width> <height> [json]") unless ARGV.length <= 3

width = ARGV[0].to_i
abort("Invalid width #{width.to_i}") unless width > 0

height = ARGV[1].to_i
abort("Invalid height #{height.to_i}") unless height > 0

render_format = ARGV[2] || "pretty"

# Create amaze
amaze = Amaze.new(width, height)

# Create outside walls and corners inside
amaze.create_outer_walls

#amaze.render

# Remove 2 random walls to create entrance
amaze.create_entrances

#amaze.render

# Randomly place inner walls while making sure all rooms are connected
amaze.place_inner_walls

#amaze.render_connected_rooms

# Render amaze
case render_format
when "pretty" then amaze.render
when "json" then amaze.render_symbols
else abort("Invalid render_format, enter pretty or json")
end
