---
id: case-studies-reviewed-mainn-maze-case
title: 多阶段迷宫求解案例
category: case-studies
tags: [case-studies, ctf, mainn, maze, case]
difficulty: intermediate
status: stable
last_reviewed: 2026-05-10
applies_to: [ctf, authorized-analysis, malware-research]
risk_level: dual-use
---
# 多阶段迷宫求解案例

## 来源

- **题目**：mainn
- **原始目录**：`prompts/reverse/mainn/`
- **核心知识点**：多阶段解题、迷宫结构提取、路径自动求解

## 结论摘要

该案例涉及多阶段逆向挑战，核心是一个多层迷宫求解问题：
1. 第一阶段：识别迷宫数据结构（2D数组嵌入二进制）
2. 第二阶段：提取迷宫尺寸和墙壁位置
3. 第三阶段：使用BFS/A*自动求解最优路径
4. 第四阶段：将路径转换为移动指令序列（wasd）

关键突破是使用符号执行（angr）自动探索路径，避免了手动跟踪复杂状态机。

难度等级：困难  
知识点标签：迷宫、多阶段、符号执行、路径求解

## 关键证据

### 1. 迷宫数据结构识别

**内存中的迷宫表示：**
```c
// 迷宫结构（从.data段提取）
char maze[HEIGHT][WIDTH] = {
    {'#', '#', '#', '#', '#', '#', '#'},
    {'#', 'S', ' ', ' ', '#', ' ', '#'},  // S = 起点
    {'#', '#', '#', ' ', '#', ' ', '#'},
    {'#', ' ', ' ', ' ', ' ', ' ', '#'},
    {'#', ' ', '#', '#', '#', 'E', '#'},  // E = 终点
    {'#', '#', '#', '#', '#', '#', '#'},
};
```

**识别信号：**
- 数据段中的连续字符数组
- `'#'`（墙）、`' '`（通道）、`'S'`（起点）、`'E'`（终点）模式
- 规则的行长度（宽度一致）

### 2. 移动验证逻辑

**核心验证函数：**
```c
int check_move(char* moves) {
    int x = start_x, y = start_y;
    
    for (int i = 0; moves[i]; i++) {
        switch (moves[i]) {
            case 'w': y--; break;
            case 's': y++; break;
            case 'a': x--; break;
            case 'd': x++; break;
        }
        
        // 边界检查
        if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT)
            return 0;
        
        // 墙壁碰撞检查
        if (maze[y][x] == '#')
            return 0;
    }
    
    // 终点检查
    return (x == end_x && y == end_y);
}
```

### 3. 多阶段验证链

```
Stage 1: check_input_format()
    └── 检查输入长度、字符集
    
Stage 2: check_path_validity()
    └── 检查每一步是否撞墙
    
Stage 3: check_optimal()
    └── 检查是否最短路径（可选）
    
Stage 4: generate_flag()
    └── 使用正确路径生成flag
```

## 可复用知识点

### 1. 迷宫数据提取脚本

```python
#!/usr/bin/env python3
"""从二进制中提取迷宫结构"""

import struct

def extract_maze(data, start_marker=b'MAZE', end_marker=b'ENDM'):
    """
    提取标记之间的迷宫数据
    
    返回: (width, height, maze_data)
    """
    start = data.find(start_marker)
    end = data.find(end_marker)
    
    if start == -1 or end == -1:
        return None
    
    maze_section = data[start + len(start_marker):end]
    
    # 读取尺寸
    width = struct.unpack('<I', maze_section[0:4])[0]
    height = struct.unpack('<I', maze_section[4:8])[0]
    
    # 读取迷宫数据
    maze_data = maze_section[8:8 + width * height]
    
    return width, height, maze_data

def visualize_maze(width, height, maze_data):
    """可视化迷宫"""
    for y in range(height):
        row = maze_data[y*width:(y+1)*width]
        print(row.decode('latin-1'))

# 使用示例
with open('mainn', 'rb') as f:
    data = f.read()

result = extract_maze(data)
if result:
    width, height, maze = result
    visualize_maze(width, height, maze)
```

### 2. BFS路径求解

```python
from collections import deque

def solve_maze(maze, start, end):
    """
    使用BFS求解最短路径
    
    Args:
        maze: 二维字符数组
        start: (x, y) 起点坐标
        end: (x, y) 终点坐标
    
    Returns:
        移动指令字符串，如 "ssddwd"
    """
    moves = {
        'w': (0, -1),
        's': (0, 1),
        'a': (-1, 0),
        'd': (1, 0)
    }
    
    queue = deque([(start, "")])
    visited = {start}
    
    while queue:
        (x, y), path = queue.popleft()
        
        if (x, y) == end:
            return path
        
        for direction, (dx, dy) in moves.items():
            nx, ny = x + dx, y + dy
            
            if (nx, ny) in visited:
                continue
            
            if maze[ny][nx] != '#':  # 不是墙
                visited.add((nx, ny))
                queue.append(((nx, ny), path + direction))
    
    return None  # 无解

# 使用示例
maze = [
    list("#######"),
    list("#S   #"),
    list("##### #"),
    list("#     #"),
    list("# ####E"),
    list("#######")
]

path = solve_maze(maze, (1, 1), (5, 4))
print(f"Path: {path}")
```

### 3. A*算法求解（带启发式）

```python
import heapq

def solve_maze_astar(maze, start, end):
    """使用A*算法求解"""
    
    def heuristic(a, b):
        """曼哈顿距离启发式"""
        return abs(a[0] - b[0]) + abs(a[1] - b[1])
    
    moves = {
        'w': (0, -1),
        's': (0, 1),
        'a': (-1, 0),
        'd': (1, 0)
    }
    
    open_set = [(0, start, "")]
    g_score = {start: 0}
    
    while open_set:
        _, (x, y), path = heapq.heappop(open_set)
        
        if (x, y) == end:
            return path
        
        for direction, (dx, dy) in moves.items():
            nx, ny = x + dx, y + dy
            
            if maze[ny][nx] == '#':
                continue
            
            tentative_g = g_score[(x, y)] + 1
            
            if (nx, ny) not in g_score or tentative_g < g_score[(nx, ny)]:
                g_score[(nx, ny)] = tentative_g
                f_score = tentative_g + heuristic((nx, ny), end)
                heapq.heappush(open_set, (f_score, (nx, ny), path + direction))
    
    return None
```

### 4. 使用符号执行自动求解

```python
import angr
import claripy

def solve_with_symbolic_execution(binary_path):
    """
    使用angr自动求解迷宫
    
    适用于：迷宫逻辑复杂，手动求解困难
    """
    p = angr.Project(binary_path, auto_load_libs=False)
    
    # 假设输入是最多50步的移动序列
    max_steps = 50
    moves = claripy.BVS('moves', max_steps * 8)
    
    # 创建入口状态
    state = p.factory.entry_state(stdin=moves)
    
    # 限制输入字符集（wasd + 结束符）
    for i in range(max_steps):
        byte = moves.get_byte(i)
        state.solver.add(
            claripy.Or(
                byte == ord('w'),
                byte == ord('a'),
                byte == ord('s'),
                byte == ord('d'),
                byte == 0  # 结束符
            )
        )
    
    # 探索到成功状态
    simgr = p.factory.simgr(state)
    
    # 定义成功条件（输出了"Success"或"Flag"）
    def is_success(s):
        stdout = s.posix.dumps(1)
        return b"Success" in stdout or b"flag" in stdout.lower()
    
    # 定义失败条件
    def is_fail(s):
        stdout = s.posix.dumps(1)
        return b"Fail" in stdout or b"Wrong" in stdout
    
    simgr.explore(find=is_success, avoid=is_fail)
    
    if simgr.found:
        solution = simgr.found[0].solver.eval(moves, cast_to=bytes)
        return solution.rstrip(b'\x00').decode('latin-1')
    
    return None

# 使用
path = solve_with_symbolic_execution('./mainn')
print(f"Solution: {path}")
```

## 误判与返工

- **误判1**：最初尝试手动跟踪迷宫路径
  - 解决：迷宫较大（20x20），手动容易出错，改为自动求解
  
- **误判2**：假设移动方向是标准方向键
  - 解决：实际是wasd，需要确认方向定义
  
- **误判3**：忽略了多阶段验证
  - 解决：静态分析发现有多层检查，需要逐层满足
  
- **误判4**：未考虑最优路径要求
  - 解决：使用BFS确保最短路径

## 应沉淀到的专题页

- [内嵌数据结构提取与离线求解](../../reversing/embedded-structure-extraction.md) - 迷宫提取方法
- [符号执行入门](../../reversing/symbolic-execution.md) - 自动求解技术
- [线性约束校验器识别与求解](../../reversing/linear-constraint-checkers.md) - 路径约束分析

## 待补脚本或自动化点

### 1. 通用迷宫求解框架

```python
#!/usr/bin/env python3
"""通用迷宫求解框架"""

import argparse
from collections import deque

class MazeSolver:
    def __init__(self, maze_data, wall_char='#', 
                 start_char='S', end_char='E', empty_char=' '):
        self.maze = [list(row) for row in maze_data.split('\n') if row]
        self.height = len(self.maze)
        self.width = len(self.maze[0]) if self.maze else 0
        
        self.wall = wall_char
        self.start_char = start_char
        self.end_char = end_char
        self.empty = empty_char
        
        self.start = self._find(start_char)
        self.end = self._find(end_char)
    
    def _find(self, char):
        for y, row in enumerate(self.maze):
            for x, c in enumerate(row):
                if c == char:
                    return (x, y)
        return None
    
    def solve(self, algorithm='bfs'):
        """求解迷宫"""
        if algorithm == 'bfs':
            return self._solve_bfs()
        elif algorithm == 'dfs':
            return self._solve_dfs()
        else:
            raise ValueError(f"Unknown algorithm: {algorithm}")
    
    def _solve_bfs(self):
        """BFS求解"""
        moves = [
            ('w', (0, -1)),
            ('s', (0, 1)),
            ('a', (-1, 0)),
            ('d', (1, 0))
        ]
        
        queue = deque([(self.start, "")])
        visited = {self.start}
        
        while queue:
            (x, y), path = queue.popleft()
            
            if (x, y) == self.end:
                return path
            
            for direction, (dx, dy) in moves.items():
                nx, ny = x + dx, y + dy
                
                if not (0 <= nx < self.width and 0 <= ny < self.height):
                    continue
                
                if (nx, ny) in visited:
                    continue
                
                if self.maze[ny][nx] == self.wall:
                    continue
                
                visited.add((nx, ny))
                queue.append(((nx, ny), path + direction))
        
        return None
    
    def _solve_dfs(self):
        """DFS求解（用于寻找所有路径）"""
        moves = [
            ('w', (0, -1)),
            ('s', (0, 1)),
            ('a', (-1, 0)),
            ('d', (1, 0))
        ]
        
        all_paths = []
        
        def dfs(pos, path, visited):
            if pos == self.end:
                all_paths.append(path)
                return
            
            x, y = pos
            for direction, (dx, dy) in moves.items():
                nx, ny = x + dx, y + dy
                
                if not (0 <= nx < self.width and 0 <= ny < self.height):
                    continue
                
                if (nx, ny) in visited:
                    continue
                
                if self.maze[ny][nx] == self.wall:
                    continue
                
                visited.add((nx, ny))
                dfs((nx, ny), path + direction, visited)
                visited.remove((nx, ny))
        
        dfs(self.start, "", {self.start})
        return all_paths
    
    def visualize_path(self, path):
        """可视化路径"""
        maze = [row[:] for row in self.maze]
        x, y = self.start
        
        for move in path:
            if move == 'w': y -= 1
            elif move == 's': y += 1
            elif move == 'a': x -= 1
            elif move == 'd': x += 1
            
            if maze[y][x] not in [self.start_char, self.end_char]:
                maze[y][x] = '*'
        
        for row in maze:
            print(''.join(row))

def main():
    parser = argparse.ArgumentParser(description='迷宫求解工具')
    parser.add_argument('maze_file', help='迷宫文件')
    parser.add_argument('-a', '--algorithm', default='bfs', 
                       choices=['bfs', 'dfs'], help='算法')
    parser.add_argument('-v', '--visualize', action='store_true',
                       help='可视化路径')
    
    args = parser.parse_args()
    
    with open(args.maze_file) as f:
        maze_data = f.read()
    
    solver = MazeSolver(maze_data)
    print(f"Start: {solver.start}, End: {solver.end}")
    
    solution = solver.solve(args.algorithm)
    
    if solution:
        print(f"Solution: {solution}")
        print(f"Steps: {len(solution)}")
        
        if args.visualize:
            print("\nVisualization:")
            solver.visualize_path(solution)
    else:
        print("No solution found")

if __name__ == '__main__':
    main()
```

## 参考资源

- angr文档: https://docs.angr.io/
- 迷宫求解算法: https://en.wikipedia.org/wiki/Maze_solving_algorithm
- BFS/A*算法教程: https://www.redblobgames.com/pathfinding/a-star/introduction.html
