package middleware

import "github.com/gin-gonic/gin"

// CORS is a permissive CORS middleware, needed only as a safety net for
// running the frontend's dev server and the backend on different ports
// without the Vite proxy configured. In Docker Compose, nginx proxies /api/
// to the backend on the same origin, so this middleware is not load-bearing
// there.
func CORS() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}
