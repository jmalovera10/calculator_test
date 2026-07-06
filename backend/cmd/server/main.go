package main

import (
	"log"

	"calculator-backend/internal/api"
)

func main() {
	router := api.NewRouter()
	if err := router.Run(":8080"); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}
